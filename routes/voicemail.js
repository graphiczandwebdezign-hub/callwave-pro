const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const asyncHandler = require('../utils/asyncHandler');
const voicemailService = require('../services/voicemailService');
const callService = require('../services/callService');
const socketService = require('../services/socketService');

const router = express.Router();

// Voicemail upload: disk storage (memory unavailable on Vercel's read-only FS).
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadDir),
  filename: (req, file, cb) => {
    const ext = (file.originalname.split('.').pop() || 'webm');
    cb(null, `vm_${Date.now()}_${uuidv4()}.${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// GET /api/voicemails/:username
router.get('/voicemails/:username', async (req, res, next) => {
  try {
    res.json(await voicemailService.forUser(req.params.username));
  } catch (err) {
    next(err);
  }
});

// POST /api/upload-voicemail
router.post('/upload-voicemail', upload.single('audio'), asyncHandler(async (req, res) => {
  const { from, to, duration } = req.body;
  if (!req.file || !from || !to) {
    return res.status(400).json({ error: 'Missing data' });
  }

  const vm = await voicemailService.create({
    from,
    to,
    file: `/uploads/${req.file.filename}`,
    filename: req.file.filename,
    duration: parseInt(duration, 10) || 0,
  });

  await callService.record({
    from,
    to,
    status: 'voicemail',
    timestamp: Date.now(),
    duration: vm.duration,
  });

  // Real-time push to the recipient if online.
  socketService.notifyUser(to, 'voicemail:new', vm);

  res.json({ success: true, voicemail: vm });
}));

// POST /api/voicemail/:id/listened
router.post('/voicemail/:id/listened', async (req, res, next) => {
  try {
    await voicemailService.markListened(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
