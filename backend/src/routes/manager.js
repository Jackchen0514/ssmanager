import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { pingManager, reconcile } from '../manager/managerService.js';

export const managerRouter = Router();

managerRouter.get('/status', asyncHandler(async (req, res) => {
  try {
    await pingManager();
    res.json({ connected: true });
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
}));

managerRouter.post('/sync', asyncHandler(async (req, res) => {
  const result = await reconcile();
  res.json(result);
}));
