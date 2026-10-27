import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiResource = vi.hoisted(() => vi.fn());
const apiSignRequest = vi.hoisted(() => vi.fn(() => 'signed-value'));

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    utils: { api_sign_request: apiSignRequest },
    api: { resource: apiResource },
    uploader: { destroy: vi.fn() },
  },
}));

import { getUploadFolder, verifyProfileAsset } from '../../src/lib/cloudinary.js';
import { env } from '../../src/config/env.js';

describe('Cloudinary profile asset verification', () => {
  const userId = 'c1263a04-7a4b-458e-aa8e-a10204564669';
  const publicId = `${getUploadFolder(userId, 'PROFILE')}/avatar`;

  beforeEach(() => {
    apiResource.mockReset();
    apiResource.mockResolvedValue({
      public_id: publicId,
      secure_url: 'https://res.cloudinary.com/test/image/upload/avatar.jpg',
      format: 'jpg', bytes: 500, width: 100, height: 100,
    });
  });

  it('uses purpose- and user-scoped folders', () => {
    expect(getUploadFolder(userId, 'PROFILE')).toMatch(new RegExp(`/${userId}/profile$`));
    expect(getUploadFolder(userId, 'LISTING')).toMatch(new RegExp(`/${userId}/listings$`));
  });

  it('accepts an owned asset that meets preset-aligned limits', async () => {
    await expect(verifyProfileAsset(userId, publicId)).resolves.toMatchObject({ publicId, format: 'jpg' });
  });

  it('rejects an asset from another user folder without looking it up', async () => {
    await expect(verifyProfileAsset(userId, `${getUploadFolder('another-user', 'PROFILE')}/avatar`)).rejects.toMatchObject({ status: 400 });
    expect(apiResource).not.toHaveBeenCalled();
  });

  it('rejects a missing asset and unsupported formats', async () => {
    apiResource.mockRejectedValueOnce({ http_code: 404 });
    await expect(verifyProfileAsset(userId, publicId)).rejects.toMatchObject({ status: 400 });
    apiResource.mockResolvedValueOnce({ public_id: publicId, secure_url: 'https://example.test/a.svg', format: 'svg', bytes: 1, width: 1, height: 1 });
    await expect(verifyProfileAsset(userId, publicId)).rejects.toMatchObject({ status: 415 });
  });

  it('rejects an asset over a configured byte or dimension limit', async () => {
    apiResource.mockResolvedValueOnce({ public_id: publicId, secure_url: 'https://example.test/a.jpg', format: 'jpg', bytes: env.CLOUDINARY_MAX_FILE_BYTES + 1, width: 100, height: 100 });
    await expect(verifyProfileAsset(userId, publicId)).rejects.toMatchObject({ status: 400 });
    apiResource.mockResolvedValueOnce({ public_id: publicId, secure_url: 'https://example.test/a.jpg', format: 'jpg', bytes: 1, width: env.CLOUDINARY_MAX_WIDTH + 1, height: 100 });
    await expect(verifyProfileAsset(userId, publicId)).rejects.toMatchObject({ status: 400 });
  });
});
