import { loadEnvFile, TEST_ENV_FILE } from './load-env';

loadEnvFile(TEST_ENV_FILE);
process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.STORAGE_LOCAL_DIR = process.env.STORAGE_LOCAL_DIR_TEST ?? '/tmp/hms-test-storage';
process.env.LOGIN_RATE_LIMIT = '10000';
