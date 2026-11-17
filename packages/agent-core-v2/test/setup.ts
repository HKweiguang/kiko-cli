for (const key of Object.keys(process.env)) {
  if (key.startsWith('KIKO_')) {
    delete process.env[key];
  }
}

delete process.env['KIKO_HOME'];

process.env['KIKO_PERSISTENCE_MINIDB_READMODEL'] = 'false';
