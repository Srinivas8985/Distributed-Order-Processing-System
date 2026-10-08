import { Router } from 'express';
import { FaultController } from '../controllers/fault.controller';
import { internalAuth } from '../middleware/internal-auth';
import { validate } from '../middleware/validate';
import { setFaultSchema } from '../schemas/fault.schema';

const router = Router();

router.use(internalAuth);

router.get('/', FaultController.getAllFaults);
router.post('/', validate(setFaultSchema), FaultController.setFault);
router.post('/disable-all', FaultController.disableAll);

export const faultRouter = router;
