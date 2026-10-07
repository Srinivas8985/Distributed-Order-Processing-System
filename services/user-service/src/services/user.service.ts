import { UserRepository } from '../repositories/user.repository';
import { NotFoundError } from '../utils/errors';

export class UserService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  async createUser(email: string, name: string) {
    return this.userRepository.createUser({ email, name });
  }

  async getUserById(id: string) {
    const user = await this.userRepository.findUserById(id);
    if (!user) {
      throw new NotFoundError(`User with id ${id} not found`);
    }
    return user;
  }
}
