import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export const getOutboxStats = async (req: Request, res: Response) => {
  try {
    const totalCount = await prisma.outboxEvent.count();
    const pendingCount = await prisma.outboxEvent.count({ where: { status: 'PENDING' } });
    const publishedCount = await prisma.outboxEvent.count({ where: { status: 'PUBLISHED' } });
    const failedCount = await prisma.outboxEvent.count({ where: { status: 'FAILED' } });

    res.status(200).json({
      total: totalCount,
      pending: pendingCount,
      published: publishedCount,
      failed: failedCount
    });
  } catch (error: any) {
    logger.error({ event: 'get_outbox_stats_error', message: error.message });
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
};

export const getOutboxEvents = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    const whereClause = status ? { status } : {};

    const events = await prisma.outboxEvent.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    res.status(200).json({ data: events });
  } catch (error: any) {
    logger.error({ event: 'get_outbox_events_error', message: error.message });
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
};
