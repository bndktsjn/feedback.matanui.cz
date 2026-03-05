import { Store, SessionData } from 'express-session';
import { PrismaService } from '../../prisma/prisma.service';

export class PrismaSessionStore extends Store {
  private readonly ttl: number;

  constructor(
    private readonly prisma: PrismaService,
    options?: { ttl?: number },
  ) {
    super();
    this.ttl = options?.ttl ?? 86_400_000; // 24h default
  }

  async get(
    sid: string,
    callback: (err?: Error | null, session?: SessionData | null) => void,
  ): Promise<void> {
    try {
      const row = await this.prisma.session.findUnique({ where: { id: sid } });
      if (!row || row.expiresAt < new Date()) {
        if (row) await this.prisma.session.delete({ where: { id: sid } }).catch(() => {});
        return callback(null, null);
      }
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      callback(null, data as SessionData);
    } catch (err) {
      callback(err as Error);
    }
  }

  async set(
    sid: string,
    session: SessionData,
    callback?: (err?: Error | null) => void,
  ): Promise<void> {
    try {
      const userId = (session as SessionData & { userId?: string }).userId;
      if (!userId) {
        callback?.(null);
        return;
      }
      const maxAge = session.cookie?.maxAge ?? this.ttl;
      const expiresAt = new Date(Date.now() + maxAge);

      await this.prisma.session.upsert({
        where: { id: sid },
        create: {
          id: sid,
          userId,
          data: JSON.parse(JSON.stringify(session)),
          expiresAt,
        },
        update: {
          data: JSON.parse(JSON.stringify(session)),
          expiresAt,
        },
      });
      callback?.(null);
    } catch (err) {
      callback?.(err as Error);
    }
  }

  async destroy(sid: string, callback?: (err?: Error | null) => void): Promise<void> {
    try {
      await this.prisma.session.delete({ where: { id: sid } }).catch(() => {});
      callback?.(null);
    } catch (err) {
      callback?.(err as Error);
    }
  }

  async touch(
    sid: string,
    session: SessionData,
    callback?: (err?: Error | null) => void,
  ): Promise<void> {
    try {
      const maxAge = session.cookie?.maxAge ?? this.ttl;
      const expiresAt = new Date(Date.now() + maxAge);
      await this.prisma.session.update({
        where: { id: sid },
        data: { expiresAt },
      });
      callback?.(null);
    } catch (err) {
      callback?.(err as Error);
    }
  }
}
