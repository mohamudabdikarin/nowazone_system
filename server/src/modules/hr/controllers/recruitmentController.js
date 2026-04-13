const HRJobPosting = require('../models/HRJobPosting');
const Resume     = require('../models/Resume');
const Employee   = require('../models/Employee');
const Attendance = require('../models/Attendance');
const { AppError } = require('../../../shared/middleware/errorHandler');
const { cloudinary } = require('../../../shared/config/cloudinary');
const emailService   = require('../../../shared/services/emailService');
const { addEmailJob } = require('../../../shared/queues/emailQueue');
const resumeParser   = require('../services/resumeParserService');
const notificationController = require('../../notifications/controllers/notificationController');

// ── Jobs ──────────────────────────────────────────────────────────────────────

exports.getJobs = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type)   filter.type   = req.query.type;
    if (req.query.search) filter.$text  = { $search: req.query.search };

    const jobs = await HRJobPosting.find(filter)
      .populate('applicantCount')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ status: 'success', data: { jobs } });
  } catch (err) { next(err); }
};

exports.createJob = async (req, res, next) => {
  try {
    const job = await HRJobPosting.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ status: 'success', data: { job } });
  } catch (err) { next(err); }
};

exports.getJob = async (req, res, next) => {
  try {
    const job = await HRJobPosting.findById(req.params.id).populate('applicantCount').lean();
    if (!job) return next(new AppError('Job not found', 404));
    res.json({ status: 'success', data: { job } });
  } catch (err) { next(err); }
};

exports.updateJob = async (req, res, next) => {
  try {
    const job = await HRJobPosting.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!job) return next(new AppError('Job not found', 404));
    res.json({ status: 'success', data: { job } });
  } catch (err) { next(err); }
};

exports.deleteJob = async (req, res, next) => {
  try {
    const job = await HRJobPosting.findByIdAndDelete(req.params.id);
    if (!job) return next(new AppError('Job not found', 404));
    res.json({ status: 'success', data: null });
  } catch (err) { next(err); }
};

// ── Resumes / Applications ────────────────────────────────────────────────────

exports.getResumes = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.jobId)             filter.jobId             = req.query.jobId;
    if (req.query.applicationStatus) filter.applicationStatus = req.query.applicationStatus;
    if (req.query.skill)             filter.skills            = req.query.skill;

    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }

    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip  = (page - 1) * limit;

    const [resumes, total] = await Promise.all([
      Resume.find(filter)
        .populate('jobId', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Resume.countDocuments(filter),
    ]);

    res.json({ status: 'success', data: { resumes, total, page, limit } });
  } catch (err) { next(err); }
};

exports.createResume = async (req, res, next) => {
  try {
    const { applicantName, email, phone, jobId } = req.body;

    let fileUrl      = undefined;
    let filePublicId = undefined;

    if (req.file) {
      fileUrl      = req.file.path;
      filePublicId = req.file.filename;
    }

    const resume = await Resume.create({
      applicantName,
      email,
      phone: phone || undefined,
      jobId: jobId || null,
      fileUrl,
      filePublicId,
    });

    const io = req.app.get('io');
    if (io) {
      await notificationController.createAndEmit(io, {
        title: 'New application received',
        message: `${resume.applicantName || resume.email} submitted an application.`,
        type: 'job',
        isGlobal: true,
        room: 'hr',
        link: '/dashboard/hr/recruitment/applications',
        metadata: {
          applicationId: resume._id,
          applicantName: resume.applicantName,
          email: resume.email,
          jobId: resume.jobId,
        },
      });
    }

    res.status(201).json({ status: 'success', data: { resume } });
  } catch (err) { next(err); }
};

exports.deleteResume = async (req, res, next) => {
  try {
    const resume = await Resume.findById(req.params.id);
    if (!resume) return next(new AppError('Resume not found', 404));

    if (resume.filePublicId) {
      // Resume PDFs are stored as Cloudinary `raw` resources.
      await cloudinary.uploader.destroy(resume.filePublicId, { resource_type: 'raw' }).catch(() => {});
    }

    await resume.deleteOne();
    res.json({ status: 'success', message: 'Resume deleted' });
  } catch (err) { next(err); }
};

exports.updateResumeStatus = async (req, res, next) => {
  try {
    const { applicationStatus, notes } = req.body;
    const updates = {};
    if (applicationStatus !== undefined) updates.applicationStatus = applicationStatus;
    if (notes !== undefined)             updates.notes             = notes;

    const resume = await Resume.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).populate('jobId', 'title');

    if (!resume) return next(new AppError('Resume not found', 404));

    // Auto-email on status change (queued for reliability)
    if (applicationStatus && ['selected', 'rejected', 'interview'].includes(applicationStatus)) {
      const payload = {
        to: resume.email,
        name: resume.applicantName,
        status: applicationStatus,
        jobTitle: resume.jobId?.title || 'the position',
      };
      addEmailJob('application_status', payload).catch(() => {
        emailService.sendApplicationStatusEmail(payload).catch(() => {});
      });
    }

    res.json({ status: 'success', data: { resume } });
  } catch (err) { next(err); }
};

exports.parseResume = async (req, res, next) => {
  try {
    const resume = await Resume.findById(req.params.id);
    if (!resume) return next(new AppError('Resume not found', 404));
    if (!resume.fileUrl) return next(new AppError('No resume file attached', 400));

    const parsed = await resumeParser.parseFromUrl(resume.fileUrl);

    resume.parsedData  = parsed;
    resume.skills      = parsed.skills      || resume.skills;
    resume.experience  = parsed.experience  || resume.experience;
    resume.education   = parsed.education   || resume.education;

    if (parsed.name && !resume.applicantName) resume.applicantName = parsed.name;
    if (parsed.email && !resume.email)        resume.email         = parsed.email;
    if (parsed.phone && !resume.phone)        resume.phone         = parsed.phone;

    await resume.save();

    res.json({ status: 'success', data: { resume, parsed } });
  } catch (err) { next(err); }
};

// ── Dashboard stats ────────────────────────────────────────────────────────────

exports.getDashboardStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const [
      totalEmployees,
      activeJobs,
      openApplications,
      attendanceToday,
    ] = await Promise.all([
      Employee.countDocuments({ status: 'active' }),
      HRJobPosting.countDocuments({ status: 'active' }),
      Resume.countDocuments({ applicationStatus: { $in: ['new', 'interview'] } }),
      Attendance.countDocuments({ date: { $gte: today, $lt: tomorrow }, status: 'present' }),
    ]);

    res.json({
      status: 'success',
      data: {
        totalEmployees,
        activeJobs,
        openApplications,
        attendanceToday,
        recentActivities: [],
      },
    });
  } catch (err) { next(err); }
};
