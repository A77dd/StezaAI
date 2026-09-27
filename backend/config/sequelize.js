const dbConfig = require('./database');

const base = {
    username: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: 'mysql',
    dialectModule: require('mysql2'),
    logging: false
};

module.exports = {
    development: base,
    production: base
};