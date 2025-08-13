module.exports = {
    apps: [
      {
        name: "demo",
        cwd: __dirname,
        script: "npm",
        args: "start",
        env: {
          PORT: 4015
        },
        autorestart: true,
        watch: false,
        time: true,
        max_memory_restart: "512M"
      }
    ]
  };
  
  
  