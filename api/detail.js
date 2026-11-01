import {createDetailHandler} from '../server/detail-handler.mjs';
import {getKbDetail} from '../server/providers/kb-detail.mjs';
import {getEncarDetail} from '../server/providers/encar-detail.mjs';
import {getKcarDetail} from '../server/providers/kcar-detail.mjs';

const handler = createDetailHandler({getKbDetail, getEncarDetail, getKcarDetail});
export const GET = handler;
export const OPTIONS = handler;
