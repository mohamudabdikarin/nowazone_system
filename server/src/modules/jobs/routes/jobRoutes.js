const express = require('express');
const multer = require('multer');
const CloudinaryStorage = require('multer-storage-cloudinary');
const { cloudinary } = require('../../../shared/config/cloudinary');
const jobCtrl = require('../controllers/jobController');
const appCtrl = require('../controllers/applicationController');
const { protect, restrictTo } = require('../../../shared/middleware/auth');

const router = express.Router();

const HR_ROLES = ['admin', 'super_admin', 'hr'];

// Public: view active jobs + get single job for apply page
router.get('/public', jobCtrl.listJobs);
router.get('/public/:id', jobCtrl.getPublicJob);

// Protected: upload resume for job application (PDF, max 10MB) — must be before /:jobId
const resumeStorage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: 'jobs/resumes',
    resource_type: 'raw',
    allowed_formats: ['pdf'],
  }),
});
const resumeUpload = multer({ storage: resumeStorage, limits: { fileSize: 10 * 1024 * 1024 } });
router.post('/upload-resume', protect, resumeUpload.single('resume'), appCtrl.uploadResume);

// Protected: submit application (requires registration/login)
router.post('/:jobId/apply', protect, appCtrl.submitApplication);

// Protected
router.use(protect);

// Client: my job applications
router.get('/applications/mine', appCtrl.listMyApplications);

router.post('/ai-refine', restrictTo(...HR_ROLES), jobCtrl.aiRefineDescription);

router.get('/stats', restrictTo(...HR_ROLES), jobCtrl.getJobStats);
router.get('/', restrictTo(...HR_ROLES), jobCtrl.listJobs);
router.post('/', restrictTo(...HR_ROLES), jobCtrl.createJob);
router.get('/:id', restrictTo(...HR_ROLES), jobCtrl.getJob);
router.patch('/:id', restrictTo(...HR_ROLES), jobCtrl.updateJob);
router.delete('/:id', restrictTo(...HR_ROLES), jobCtrl.deleteJob);

// Applications under jobs
router.get('/:jobId/applications', restrictTo(...HR_ROLES), appCtrl.listApplications);

module.exports = router;
