import { v2 as cloudinary } from 'cloudinary';

import { env, requireCloudinaryConfig } from '../config/env.js';
import { AppError } from './errors.js';

export type CloudinaryAsset = {
  publicId: string;
  secureUrl: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
};

let configured = false;

const client = (): typeof cloudinary => {
  if (!configured) {
    const config = requireCloudinaryConfig();
    cloudinary.config({
      cloud_name: config.CLOUDINARY_CLOUD_NAME,
      api_key: config.CLOUDINARY_API_KEY,
      api_secret: config.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
};

export const getUploadFolder = (userId: string, purpose: 'PROFILE' | 'LISTING'): string =>
  `${env.CLOUDINARY_UPLOAD_FOLDER_ROOT}/${userId}/${purpose === 'PROFILE' ? 'profile' : 'listings'}`;

export const createUploadSignature = (userId: string, purpose: 'PROFILE' | 'LISTING') => {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = getUploadFolder(userId, purpose);
  const signature = client().utils.api_sign_request(
    { timestamp, folder, upload_preset: env.CLOUDINARY_UPLOAD_PRESET },
    requireCloudinaryConfig().CLOUDINARY_API_SECRET,
  );
  return {
    cloudName: requireCloudinaryConfig().CLOUDINARY_CLOUD_NAME,
    apiKey: requireCloudinaryConfig().CLOUDINARY_API_KEY,
    timestamp,
    folder,
    uploadPreset: env.CLOUDINARY_UPLOAD_PRESET,
    signature,
  };
};

export const getAsset = async (publicId: string): Promise<CloudinaryAsset | null> => {
  try {
    const resource = await client().api.resource(publicId, { resource_type: 'image' });
    return {
      publicId: resource.public_id,
      secureUrl: resource.secure_url,
      format: resource.format,
      bytes: resource.bytes,
      width: resource.width,
      height: resource.height,
    };
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'http_code' in error && error.http_code === 404) {
      return null;
    }
    throw error;
  }
};

export const verifyProfileAsset = async (userId: string, publicId: string): Promise<CloudinaryAsset> => {
  const expectedPrefix = `${getUploadFolder(userId, 'PROFILE')}/`;
  if (!publicId.startsWith(expectedPrefix)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Profile image is not in your upload folder');
  }
  const asset = await getAsset(publicId);
  if (!asset) throw new AppError(400, 'VALIDATION_ERROR', 'Profile image was not found');
  const config = requireCloudinaryConfig();
  if (!['jpg', 'png', 'webp'].includes(asset.format.toLowerCase())) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA', 'Profile image format is not supported');
  }
  if (asset.bytes > config.CLOUDINARY_MAX_FILE_BYTES || asset.width > config.CLOUDINARY_MAX_WIDTH || asset.height > config.CLOUDINARY_MAX_HEIGHT) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Profile image exceeds configured upload limits');
  }
  return asset;
};

export const destroyAsset = async (publicId: string): Promise<void> => {
  await client().uploader.destroy(publicId, { resource_type: 'image' });
};
