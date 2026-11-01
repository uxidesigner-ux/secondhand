import { createSearchHandler } from '../server/handler.mjs';
import { searchGoods } from '../server/providers/goods.mjs';
import { searchCars } from '../server/providers/cars.mjs';
const handler=createSearchHandler({searchGoods,searchCars});
export const GET=handler;
export const OPTIONS=handler;
