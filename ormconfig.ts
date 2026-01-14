import { DataSource } from 'typeorm';

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'postgres',
  database: process.env.DB_NAME || 'gecom_db',
  migrations: ['src/typeorm/migrations/*.{ts,js}'],
  synchronize: false,
  logging: true,
});

export default AppDataSource;
