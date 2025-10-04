module.exports = {
  apps: [{
    name: 'ta',
      script: 'src/app.js',
      instances: 1,
      exec_mode: 'fork',
    },
  ],
}; 