import { App } from '@/app';
import { AuthRoute } from '@routes/auth.route';
import { UserRoute } from '@routes/users.route';
import { ValidateEnv } from '@utils/validateEnv';
import IndexRoute from '@routes/index.route';
import HieRouter from './routes/hie.route'
ValidateEnv();

const app = new App([new IndexRoute(), new UserRoute(), new AuthRoute(), new HieRouter()]);

app.listen();
