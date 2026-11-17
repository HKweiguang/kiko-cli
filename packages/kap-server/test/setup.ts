for (const key of Object.keys(process.env)) {
  if (key.startsWith('KIKO_')) {
    delete process.env[key];
  }
}

process.env['KIKO_SEARCH_WORKER'] = 'false';

process.env['KIKO_PERSISTENCE_MINIDB_READMODEL'] = 'false';
