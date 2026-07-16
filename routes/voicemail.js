const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const asyncHandler = require('../utils/asyncHandler');
const voicemailService = require('../services/voicemailService');
const callService = require('../services/callService');
const socketService = require('../services/socketService');
const storageService = require('../services/storageService');
const { ownUserOrLegacy } = require('../middleware/ownUser');

const router = express.Router();

// Voicemail upload: buffer in memory, then persist via the storage service
// (local FS or Supabase Storage). Memory storage avoids disk-path issues on
// serverless and lets the provider decide where the bytes land.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

function voicemailFilename(originalname) {
  const ext = originalname.split('.').pop() || 'webm';
  return `vm_${Date.now()}_${uuidv4()}.${ext}`;
}

// GET /api/voicemails/:username  (authenticated users restricted to their own)
router.get('/voicemails/:username', ownUserOrLegacy, async (req, res, next) => {
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

  // Persist the audio via the configured provider (local FS or Supabase Storage).
  const filename = voicemailFilename(req.file.originalname);
  const stored = await storageService.save({
    buffer: req.file.buffer,
    filename,
    contentType: req.file.mimetype,
  });

  const vm = await voicemailService.create({
    from,
    to,
    file: stored.url, // '/uploads/...' (local) or full Supabase URL
    filename: stored.key,
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
