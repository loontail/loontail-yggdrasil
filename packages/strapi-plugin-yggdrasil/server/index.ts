import bootstrap, { teardown } from './bootstrap';
import config from './config';
import contentTypes from './content-types';
import controllers from './controllers';
import middlewares from './middlewares';
import yggdrasilTokenAuth from './policies/yggdrasil-token-auth';
import register from './register';
import routes from './routes';
import services from './services';

export default {
  register,
  bootstrap,
  destroy: teardown,
  config,
  contentTypes,
  controllers,
  routes,
  services,
  middlewares,
  policies: {
    'yggdrasil-token-auth': yggdrasilTokenAuth,
  },
};
