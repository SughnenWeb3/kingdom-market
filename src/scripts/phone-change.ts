import 'dotenv/config';

import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

type Action = 'approve' | 'reject';

const fail = (message: string): never => {
  console.error(message);
  process.exitCode = 1;
  throw new Error(message);
};

const readArgs = (): { id: string; action: Action; reviewer: string } => {
  const args = process.argv.slice(2);
  const value = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const id = value('--id');
  const action = value('--action');
  const reviewer = value('--reviewer')?.trim();
  if (!id || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) fail('Invalid or missing --id UUID');
  if (action !== 'approve' && action !== 'reject') fail('--action must be approve or reject');
  if (!reviewer) fail('Missing --reviewer');
  return { id: id as string, action: action as Action, reviewer: reviewer as string };
};

const main = async (): Promise<void> => {
  const { id, action, reviewer } = readArgs();
  const processed = await prisma.$transaction(async (tx) => {
    const request = await tx.phoneChangeRequest.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, user: { select: { providerProfile: { select: { id: true } } } } },
    });
    if (!request) throw new Error('Phone-change request not found');
    if (request.status !== 'PENDING') throw new Error('Phone-change request has already been reviewed');
    if (!request.user.providerProfile) throw new Error('Phone-change request has no provider profile');
    const provider = request.user.providerProfile;
    const reviewedAt = new Date();
    const changed = await tx.phoneChangeRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: action === 'approve' ? 'APPROVED' : 'REJECTED', reviewerReference: reviewer, reviewedAt },
    });
    if (changed.count !== 1) throw new Error('Phone-change request has already been reviewed');
    if (action === 'approve') {
      const phoneRequest = await tx.phoneChangeRequest.findUniqueOrThrow({ where: { id }, select: { proposedPhone: true } });
      await tx.providerProfile.update({ where: { id: provider.id }, data: { phoneNumber: phoneRequest.proposedPhone } });
    }
    return { userId: request.userId, providerId: provider.id };
  });
  logger.info({ event: `phone_change.${action}d`, requestId: id, userId: processed.userId, providerId: processed.providerId, reviewer }, 'Phone change reviewed');
};

main().catch((error: unknown) => {
  if (process.exitCode !== 1) {
    console.error(error instanceof Error ? error.message : 'Phone-change review failed');
    process.exitCode = 1;
  }
}).finally(async () => prisma.$disconnect());
