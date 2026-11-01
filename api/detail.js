import {createDetailHandler} from '../server/detail-handler.mjs';
import {getKbDetail} from '../server/providers/kb-detail.mjs';

const handler = createDetailHandler({getKbDetail});
export const GET = handler;
export const OPTIONS = handler;
