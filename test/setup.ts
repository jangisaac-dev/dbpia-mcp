import { beforeAll, afterAll, afterEach } from 'vitest';
import { setGlobalDispatcher, getGlobalDispatcher, MockAgent } from 'undici';

const originalDispatcher = getGlobalDispatcher();
const mockAgent = new MockAgent();

beforeAll(() => {
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

afterEach(() => {
  mockAgent.assertNoPendingInterceptors();
});

afterAll(() => {
  setGlobalDispatcher(originalDispatcher);
});

export { mockAgent };
