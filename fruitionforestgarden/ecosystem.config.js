module.exports = {
  apps: [
    {
      name: 'ffg',
      script: 'src/app.js',
      instances: 1,
      exec_mode: 'fork',
    },
  ],
}; 