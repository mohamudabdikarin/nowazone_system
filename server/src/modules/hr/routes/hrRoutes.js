const express = require('express');
const multer  = require('multer');
const CloudinaryStorage = require('multer-storage-cloudinary');
const { cloudinary } = require('../../../shared/config/cloudinary');
const { protect, restrictTo } = require('../../../shared/middleware/auth');

const employeeController    = require('../controllers/employeeController');
const attendanceController  = require('../controllers/attendanceController');
const recruitmentController = require('../controllers/recruitmentController');
const integrationController = require('../controllers/integrationController');

const router = express.Router();

// ── Multer: employee photos ────────────────────────────────────────────────────
const photoStorage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder:     'hr/employees',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 600, height: 600, crop: 'limit' }],
  }),
});
const photoUpload = multer({ storage: photoStorage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── Multer: resume PDFs ────────────────────────────────────────────────────────
const resumeStorage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder:        'hr/resumes',
    resource_type: 'raw',
    allowed_formats: ['pdf'],
  }),
});
const resumeUpload = multer({ storage: resumeStorage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── Multer: employee documents (PDF/images) ────────────────────────────────────
const employeeDocStorage = new CloudinaryStorage({
  cloudinary,
  params: async (_req, file) => {
    const isPdf = file.mimetype === 'application/pdf';
    if (isPdf) {
      return {
        folder:        'hr/employee-documents',
        resource_type: 'raw',
        allowed_formats: ['pdf'],
      };
    }
    return {
      folder:        'hr/employee-documents',
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [{ width: 1800, height: 1800, crop: 'limit' }],
    };
  },
});
const employeeDocUpload = multer({ storage: employeeDocStorage, limits: { fileSize: 10 * 1024 * 1024 } });

// All HR routes require authentication + HR/admin role
router.use(protect, restrictTo('hr', 'admin', 'super_admin'));

// ── Dashboard ──────────────────────────────────────────────────────────────────
router.get('/dashboard', recruitmentController.getDashboardStats);

// ── Employees ──────────────────────────────────────────────────────────────────
router
  .route('/employees')
  .get(employeeController.getEmployees)
  .post(photoUpload.single('photo'), employeeController.createEmployee);

router
  .route('/employees/:id')
  .get(employeeController.getEmployee)
  .patch(photoUpload.single('photo'), employeeController.updateEmployee)
  .delete(employeeController.deleteEmployee);

// Employee documents
router.post('/employees/:id/documents', employeeDocUpload.single('document'), employeeController.addEmployeeDocument);
router.delete('/employees/:id/documents/:docIndex', employeeController.deleteEmployeeDocument);

// ── Attendance ─────────────────────────────────────────────────────────────────
// Named sub-routes MUST come before /:id to avoid param conflicts
router.get('/attendance/daily',         attendanceController.getDailyAttendance);
router.get('/attendance/stats',         attendanceController.getAttendanceStats);
router.post('/attendance/bulk',         attendanceController.bulkMarkAttendance);

router
  .route('/attendance')
  .get(attendanceController.getAttendance)
  .post(attendanceController.createAttendance);

router
  .route('/attendance/:id')
  .patch(attendanceController.updateAttendance)
  .delete(attendanceController.deleteAttendance);

// ── Jobs ───────────────────────────────────────────────────────────────────────
router
  .route('/jobs')
  .get(recruitmentController.getJobs)
  .post(recruitmentController.createJob);

router
  .route('/jobs/:id')
  .get(recruitmentController.getJob)
  .patch(recruitmentController.updateJob)
  .delete(recruitmentController.deleteJob);

// ── Resumes / Applications ─────────────────────────────────────────────────────
router
  .route('/resumes')
  .get(recruitmentController.getResumes)
  .post(resumeUpload.single('resume'), recruitmentController.createResume);

router.patch('/resumes/:id/status',  recruitmentController.updateResumeStatus);
router.post('/resumes/:id/parse',    recruitmentController.parseResume);
router.delete('/resumes/:id',        recruitmentController.deleteResume);

// ── Integrations ───────────────────────────────────────────────────────────────
router.get('/integrations/linkedin/connect',  integrationController.linkedinConnect);
router.get('/integrations/linkedin/callback', integrationController.linkedinCallback);
router.post('/integrations/linkedin/post-job', integrationController.linkedinPostJob);

router.get('/integrations/indeed/connect',   integrationController.indeedConnect);
router.get('/integrations/indeed/callback',  integrationController.indeedCallback);
router.post('/integrations/indeed/post-job', integrationController.indeedPostJob);

router.post('/integrations/naukri/post-job', integrationController.naukriPostJob);

module.exports = router;
