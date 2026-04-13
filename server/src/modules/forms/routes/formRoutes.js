const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/formController');
const { protect, authorize } = require('../../../shared/middleware/auth');

// Public form submission endpoints (rate-limited in controller)
router.post('/contact', ctrl.submitContact);
router.post('/assessment', ctrl.submitAssessment);
router.post('/appointment', ctrl.submitAppointment);
router.post('/download', ctrl.submitDownload);

// Client: my form submissions
router.get('/mine', protect, ctrl.getMySubmissions);

// Admin endpoints
router.get('/submissions', protect, authorize('forms.read', 'crm.write', '*'), ctrl.getSubmissions);
router.get('/submissions/:id', protect, authorize('forms.read', 'crm.write', '*'), ctrl.getSubmission);
router.patch('/submissions/:id/status', protect, authorize('forms.update', 'crm.write', '*'), ctrl.updateSubmissionStatus);
router.delete('/submissions/:id', protect, authorize('forms.delete', 'crm.write', '*'), ctrl.deleteSubmission);
router.get('/stats', protect, authorize('forms.read', 'crm.write', '*'), ctrl.getStats);

module.exports = router;
