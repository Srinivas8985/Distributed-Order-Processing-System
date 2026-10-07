import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { ConflictError } from '../utils/errors';

export class UserRepository {
  async createUser(data: { email: string; name: string }) {
    try {
      return await prisma.user.create({
        data,
      });
    } catch (error) {
      // P2002 is Prisma's unique constraint violation error code
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('A user with this email already exists');
      }
      throw error;
    }
  }

  async findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
    });
  }
}
