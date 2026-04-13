const FormSubmission = require('../models/FormSubmission');
const Lead = require('../../crm/models/Lead');
const CalendarEvent = require('../../calendar/models/CalendarEvent');
const GoogleCalendarConnection = require('../../calendar/models/GoogleCalendarConnection');
const { AppError } = require('../../../shared/middleware/errorHandler');
const rateLimit = require('express-rate-limit');
const emailService = require('../../../shared/services/emailService');
const { invalidateDashboardCache } = require('../../../shared/services/dashboardCache');
const notificationController = require('../../notifications/controllers/notificationController');

// ─── In-memory rate limiters for public form endpoints ──────────────────────

const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { status: 'fail', message: 'Too many submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { status: 'fail', message: 'Too many contact submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Helpers ────────────────────────────────────────────────────────────────────

async function createLeadFromSubmission(submission, req) {
  const lead = await Lead.create({
    name: submission.name,
    email: submission.email,
    phone: submission.phone || '0000000000',
    company: submission.company || '',
    source: 'website',
    status: 'new',
    metadata: { formType: submission.type, formId: submission._id, page: submission.page },
  });

  submission.leadId = lead._id;
  await submission.save();

  const io = req.app.get('io');
  if (io) {
    await notificationController.createAndEmit(io, {
      title: `New ${submission.type} submission`,
      message: `${submission.name} submitted a ${submission.type} form`,
      type: 'lead',
      isGlobal: true,
      room: 'crm',
      link: '/dashboard/form-submissions',
      metadata: { formId: submission._id, leadId: lead._id, formType: submission.type },
    });
  }

  return lead;
}

/**
 * Create a CalendarEvent (and Google Meet link when possible) for an appointment
 * and send a confirmation email to the requester.
 *
 * Uses APPOINTMENT_OWNER_USER_ID and APPOINTMENT_CALENDAR_ID env vars to decide
 * which internal user/calendar should own the event.
 */
async function createAppointmentEventAndNotify(submission, req) {
  try {
    const ownerId = process.env.APPOINTMENT_OWNER_USER_ID;
    if (!ownerId) return;

    const { preferredDate, preferredTime, serviceType } = submission.formData || {};
    if (!preferredDate || !preferredTime) return;

    const start = new Date(`${preferredDate}T${preferredTime}`);
    const end = new Date(start.getTime() + 30 * 60 * 1000); // default 30 minutes

    const title = `Appointment – ${submission.name}`;
    const description = submission.message || '';
    const location = '';

    // Create local calendar event
    const event = await CalendarEvent.create({
      title,
      description,
      startAt: start,
      endAt: end,
      isAllDay: false,
      location,
      visibility: 'team',
      participants: [],
      createdBy: ownerId,
      source: 'manual',
    });

    let meetingUrl = '';

    // Try to create a Google Calendar event with Meet link if Google is connected
    const connection = await GoogleCalendarConnection.findOne({ user: ownerId }).select('+accessToken +refreshToken');
    if (connection && process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REDIRECT_URI) {
      try {
        const calendarId = process.env.APPOINTMENT_CALENDAR_ID || 'primary';
        const endpointBase = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
        const endpoint = `${endpointBase}?conferenceDataVersion=1`;

        const payload = {
          summary: title,
          description,
          location,
          start: { dateTime: start.toISOString() },
          end:   { dateTime: end.toISOString() },
          conferenceData: {
            createRequest: {
              requestId: `appt-${event._id}-${Date.now()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        };

        const accessToken = connection.accessToken;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const created = await response.json();
          event.googleEventId = created.id || event.googleEventId;
          event.source = 'google';
          const meetLink =
            created.hangoutLink ||
            created.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ||
            '';
          if (meetLink) {
            event.meetingUrl = meetLink;
            meetingUrl = meetLink;
          }
          await event.save({ validateBeforeSave: false });
        }
      } catch {
        // Ignore Google errors for now; appointment still exists locally
      }
    }

    // Send confirmation email (fire-and-forget)
    if (submission.email) {
      const dateString = start.toLocaleString();
      const serviceText = serviceType ? `Service: ${serviceType}\n` : '';
      const linkText = meetingUrl ? `Join link: ${meetingUrl}\n` : '';
      const text = `Hi ${submission.name},\n\nYour appointment request has been received.\n\n${serviceText}Date & time: ${dateString}\n${linkText}\nIf you need to reschedule, please reply to this email.\n\n— NowAZone`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
          <h2 style="color:#0f172a;">Your appointment is scheduled</h2>
          <p>Hi ${submission.name},</p>
          <p>Your appointment request has been received and scheduled.</p>
          ${serviceType ? `<p><strong>Service:</strong> ${serviceType}</p>` : ''}
          <p><strong>Date &amp; time:</strong> ${dateString}</p>
          ${meetingUrl ? `<p><strong>Join link:</strong> <a href="${meetingUrl}">${meetingUrl}</a></p>` : ''}
          <p>If you need to reschedule, just reply to this email.</p>
        </div>
      `;
      emailService.sendMail?.({ to: submission.email, subject: 'Your appointment is scheduled', html, text }).catch(() => {});
    }
  } catch {
    // Do not block form submission on calendar/email issues
  }
}

// ─── Public form submission endpoints ───────────────────────────────────────────

exports.submitContact = [
  contactLimiter,
  async (req, res, next) => {
    try {
      const { name, email, phone, company, message, page } = req.body;
      if (!name || !email) {
        return next(new AppError('Name and email are required', 400));
      }

      const submission = await FormSubmission.create({
        type: 'contact',
        name,
        email,
        phone,
        company,
        message,
        page,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || '',
      });

      await createLeadFromSubmission(submission, req);
      invalidateDashboardCache().catch(() => {});

      res.status(201).json({
        status: 'success',
        message: 'Contact form submitted successfully',
        data: { id: submission._id },
      });
    } catch (err) { next(err); }
  },
];

exports.submitAssessment = [
  formLimiter,
  async (req, res, next) => {
    try {
      const { name, email, company, businessSize, industry, aiGoals, page, ...rest } = req.body;
      if (!name || !email) {
        return next(new AppError('Name and email are required', 400));
      }

      const submission = await FormSubmission.create({
        type: 'assessment',
        name,
        email,
        company,
        page,
        formData: { businessSize, industry, aiGoals, ...rest },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || '',
      });

      await createLeadFromSubmission(submission, req);
      invalidateDashboardCache().catch(() => {});

      res.status(201).json({
        status: 'success',
        message: 'Assessment form submitted successfully',
        data: { id: submission._id },
      });
    } catch (err) { next(err); }
  },
];

exports.submitAppointment = [
  formLimiter,
  async (req, res, next) => {
    try {
      const { name, email, phone, company, preferredDate, preferredTime,
              serviceType, message, page } = req.body;
      if (!name || !email) {
        return next(new AppError('Name and email are required', 400));
      }

      const submission = await FormSubmission.create({
        type: 'appointment',
        name,
        email,
        phone,
        company,
        message,
        page,
        formData: { preferredDate, preferredTime, serviceType },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || '',
      });

      await createLeadFromSubmission(submission, req);

      // Create a calendar event + Google Meet link (when configured) and email the client.
      createAppointmentEventAndNotify(submission, req).catch(() => {});
      invalidateDashboardCache().catch(() => {});

      res.status(201).json({
        status: 'success',
        message: 'Appointment request submitted successfully',
        data: { id: submission._id },
      });
    } catch (err) { next(err); }
  },
];

exports.submitDownload = [
  formLimiter,
  async (req, res, next) => {
    try {
      const { name, email, company, phone, resourceName, page } = req.body;
      if (!name || !email) {
        return next(new AppError('Name and email are required', 400));
      }

      const submission = await FormSubmission.create({
        type: 'download',
        name,
        email,
        phone,
        company,
        page,
        formData: { resourceName },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || '',
      });

      await createLeadFromSubmission(submission, req);

      res.status(201).json({
        status: 'success',
        message: 'Download request submitted successfully',
        data: { id: submission._id },
      });
    } catch (err) { next(err); }
  },
];

// ─── Client: my form submissions ────────────────────────────────────────────────

exports.getMySubmissions = async (req, res, next) => {
  try {
    const email = (req.user && req.user.email) ? req.user.email.toLowerCase() : null;
    if (!email) return next(new AppError('Not authenticated', 401));

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const filter = { email };
    if (req.query.type) filter.type = req.query.type;

    const [submissions, total] = await Promise.all([
      FormSubmission.find(filter).select('-ipAddress -userAgent').sort('-createdAt').skip((page - 1) * limit).limit(limit),
      FormSubmission.countDocuments(filter),
    ]);

    res.json({ status: 'success', data: { submissions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
  } catch (err) { next(err); }
};

// ─── Admin endpoints ────────────────────────────────────────────────────────────

exports.getSubmissions = async (req, res, next) => {
  try {
    const page  = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const filter = {};

    if (req.query.type) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
    }
    if (req.query.search) {
      filter.$or = [
        { name:  { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
        { company: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [submissions, total] = await Promise.all([
      FormSubmission.find(filter)
        .populate('leadId', 'name email status')
        .populate('respondedBy', 'name email')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(limit),
      FormSubmission.countDocuments(filter),
    ]);

    res.json({
      status: 'success',
      data: {
        submissions,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (err) { next(err); }
};

exports.getSubmission = async (req, res, next) => {
  try {
    const submission = await FormSubmission.findById(req.params.id)
      .populate('leadId', 'name email status score')
      .populate('respondedBy', 'name email');

    if (!submission) {
      return next(new AppError('Form submission not found', 404));
    }

    res.json({ status: 'success', data: { submission } });
  } catch (err) { next(err); }
};

exports.updateSubmissionStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status || !['new', 'read', 'responded', 'archived'].includes(status)) {
      return next(new AppError('Valid status is required (new, read, responded, archived)', 400));
    }

    const update = { status };
    if (status === 'responded') {
      update.respondedBy = req.user._id;
      update.respondedAt = new Date();
    }

    const submission = await FormSubmission.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true },
    );

    if (!submission) {
      return next(new AppError('Form submission not found', 404));
    }

    res.json({
      status: 'success',
      message: 'Submission status updated',
      data: { submission },
    });
  } catch (err) { next(err); }
};

exports.deleteSubmission = async (req, res, next) => {
  try {
    const submission = await FormSubmission.findByIdAndDelete(req.params.id);

    if (!submission) {
      return next(new AppError('Form submission not found', 404));
    }

    invalidateDashboardCache().catch(() => {});

    res.json({
      status: 'success',
      message: 'Submission deleted successfully',
    });
  } catch (err) { next(err); }
};

exports.getStats = async (req, res, next) => {
  try {
    const [byType, byStatus] = await Promise.all([
      FormSubmission.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      FormSubmission.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const total = byType.reduce((sum, t) => sum + t.count, 0);

    res.json({
      status: 'success',
      data: {
        total,
        byType: byType.map(t => ({ type: t._id, count: t.count })),
        byStatus: byStatus.map(s => ({ status: s._id, count: s.count })),
      },
    });
  } catch (err) { next(err); }
};
