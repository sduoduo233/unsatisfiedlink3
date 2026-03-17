#!/usr/bin/env bash

rm release.zip || true

7z a release.zip index.php common.php cron.php startupload.php uploadpart.php endupload.php sw/index.php d/index.php reader.js sw.js writer.js readpart.php