const path = require('path')
const root = __dirname

module.exports = {
  apps: [
    {
      name: 'rag-backend',
      script: 'cmd.exe',
      args: `/c "${path.join(root, 'start-backend.bat')}"`,
      interpreter: 'none',
      env: { PYTHONUNBUFFERED: '1' },
    },
    {
      name: 'rag-frontend',
      script: 'cmd.exe',
      args: `/c "${path.join(root, 'start-frontend.bat')}"`,
      interpreter: 'none',
    },
  ],
}
