const cloudinary = require('cloudinary').v2;
const CloudinaryStorage = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    if (file.mimetype.startsWith('video/')) {
      return {
        folder: 'blog-videos',
        resource_type: 'video',
        allowed_formats: ['mp4', 'mov', 'avi', 'webm'],
        transformation: [{ width: 1280, height: 720, crop: 'limit' }],
      };
    }
    return {
      folder: 'blog-images',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      transformation: [{ width: 1200, height: 630, crop: 'limit' }],
    };
  },
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for videos
});

const userAvatarStorage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: 'users',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 600, height: 600, crop: 'limit' }],
  }),
});

const userAvatarUpload = multer({
  storage: userAvatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB avatar limit
});

module.exports = { cloudinary, upload, userAvatarUpload };
