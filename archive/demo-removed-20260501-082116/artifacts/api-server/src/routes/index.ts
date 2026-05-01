// demo/artifacts/api-server/src/routes/index.ts
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import { inventoryRouter } from "./inventory";
import worldEventsRouter from "./world-events";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use('/inventory', inventoryRouter);
router.use(worldEventsRouter);

export default router;