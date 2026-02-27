// Repo Tour — Voice + Animation Engine for GitHub walkthroughs
// Injected into Chrome via Puppeteer MCP. All functions on window.__rt.

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  var _activeRecognition = null;
  var _activeVAD = null; // { stream, ctx, timer }
  var _micStream = null; // cached mic stream

  // ---------------------------------------------------------------------------
  // Cleanup — kill all active TTS/STT/VAD
  // ---------------------------------------------------------------------------

  function killActiveAudio() {
    window.speechSynthesis.cancel();
    if (_activeRecognition) {
      try { _activeRecognition.stop(); } catch (e) {}
      _activeRecognition = null;
    }
    if (_activeVAD) {
      if (_activeVAD.timer) clearInterval(_activeVAD.timer);
      if (_activeVAD.ctx) try { _activeVAD.ctx.close(); } catch (e) {}
      if (_activeVAD.stream) _activeVAD.stream.getTracks().forEach(function (t) { t.stop(); });
      _activeVAD = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Mic permission — one-time request, caches stream
  // ---------------------------------------------------------------------------

  async function requestMic() {
    if (_micStream) return true;
    try {
      _micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      return true;
    } catch (e) {
      console.warn('[RepoTour] Mic access denied:', e.message);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // TTS — speak text with Chrome cancel-bug + pause-bug workarounds
  // ---------------------------------------------------------------------------

  function speak(text) {
    return new Promise(function (resolve) {
      if (!window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();
      setTimeout(function () {
        var utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 1.05;
        // Chrome pauses long utterances (~15s). Keep-alive timer resumes them.
        var keepAlive = setInterval(function () {
          if (!window.speechSynthesis.speaking) { clearInterval(keepAlive); return; }
          if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        }, 5000);
        utterance.onend = function () { clearInterval(keepAlive); resolve(); };
        utterance.onerror = function () { clearInterval(keepAlive); resolve(); };
        window.speechSynthesis.speak(utterance);
      }, 80);
    });
  }

  // ---------------------------------------------------------------------------
  // STT — listen for speech, returns transcript string
  // ---------------------------------------------------------------------------

  function listen(timeoutMs) {
    timeoutMs = timeoutMs || 30000;
    return new Promise(function (resolve) {
      killActiveAudio();
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { resolve('[speech recognition not available]'); return; }

      var recognition = new SR();
      _activeRecognition = recognition;
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      var resolved = false;
      var transcript = '';
      var silenceTimer = null;

      function done(result) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        if (silenceTimer) clearTimeout(silenceTimer);
        try { recognition.stop(); } catch (e) {}
        _activeRecognition = null;
        resolve(result);
      }

      var timer = setTimeout(function () { done(transcript || '[no response]'); }, timeoutMs);

      recognition.onresult = function (event) {
        for (var i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript + ' ';
          }
        }
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(function () { done(transcript.trim()); }, 2000);
      };

      recognition.onerror = function (event) {
        if (event.error === 'no-speech') return;
        done(transcript || '[no response]');
      };

      recognition.onend = function () {
        if (!resolved) {
          try { recognition.start(); } catch (e) { done(transcript || '[no response]'); }
        }
      };

      recognition.start();
    });
  }

  // ---------------------------------------------------------------------------
  // VAD — voice activity detection via AudioContext (echo-cancelled)
  // ---------------------------------------------------------------------------

  function startVAD(onVoiceDetected) {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    }).then(function (stream) {
      var ctx = new AudioContext();
      var source = ctx.createMediaStreamSource(stream);
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      var dataArray = new Uint8Array(analyser.frequencyBinCount);
      var voiceFrames = 0;

      var timer = setInterval(function () {
        analyser.getByteFrequencyData(dataArray);
        var sum = 0;
        for (var i = 0; i < dataArray.length; i++) sum += dataArray[i];
        var avg = sum / dataArray.length;
        if (avg > 15) {
          voiceFrames++;
          if (voiceFrames >= 3) onVoiceDetected(); // ~240ms sustained
        } else {
          voiceFrames = 0;
        }
      }, 80);

      _activeVAD = { stream: stream, ctx: ctx, timer: timer };
      return _activeVAD;
    }).catch(function (e) {
      console.warn('[RepoTour] VAD mic access failed:', e.message);
      return null;
    });
  }

  function stopVAD() {
    if (_activeVAD) {
      if (_activeVAD.timer) clearInterval(_activeVAD.timer);
      if (_activeVAD.ctx) try { _activeVAD.ctx.close(); } catch (e) {}
      if (_activeVAD.stream) _activeVAD.stream.getTracks().forEach(function (t) { t.stop(); });
      _activeVAD = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Speak + Listen with barge-in
  // Dual detectors: AudioContext VAD + STT interim results
  // ---------------------------------------------------------------------------

  function speakAndListen(text, timeoutMs) {
    timeoutMs = timeoutMs || 30000;
    killActiveAudio();

    return new Promise(function (resolve) {
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        speak(text).then(function () { resolve('[speech recognition not available]'); });
        return;
      }

      var resolved = false;
      var transcript = '';
      var silenceTimer = null;
      var speaking = true;
      var bargedIn = false;
      var keepAlive = null;

      function cleanup() {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        if (silenceTimer) clearTimeout(silenceTimer);
        if (keepAlive) clearInterval(keepAlive);
        window.speechSynthesis.cancel();
        try { recognition.stop(); } catch (e) {}
        _activeRecognition = null;
        stopVAD();
      }

      function bargeIn() {
        if (!speaking || bargedIn) return;
        bargedIn = true;
        speaking = false;
        console.log('[RepoTour] Barge-in detected');
        window.speechSynthesis.cancel();
        if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
        stopVAD();
      }

      var timer = setTimeout(function () {
        cleanup();
        resolve(transcript || '[no response]');
      }, timeoutMs);

      // --- STT ---
      var recognition = new SR();
      _activeRecognition = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onresult = function (event) {
        for (var i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript + ' ';
          } else if (speaking) {
            bargeIn();
          }
        }
        if (!speaking) {
          if (silenceTimer) clearTimeout(silenceTimer);
          silenceTimer = setTimeout(function () {
            cleanup();
            resolve(transcript.trim() || '[no response]');
          }, 2500);
        }
      };

      recognition.onerror = function (event) {
        if (event.error === 'no-speech') return;
        if (speaking) return;
        cleanup();
        resolve(transcript || '[no response]');
      };

      recognition.onend = function () {
        if (!resolved) {
          setTimeout(function () {
            if (resolved) return;
            try { recognition.start(); } catch (e) {
              cleanup();
              resolve(transcript || '[no response]');
            }
          }, 100);
        }
      };

      // --- VAD for barge-in ---
      startVAD(bargeIn);

      // --- TTS with Chrome cancel-bug workaround ---
      window.speechSynthesis.cancel();
      setTimeout(function () {
        if (resolved) return;
        var utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 1.05;
        keepAlive = setInterval(function () {
          if (!window.speechSynthesis.speaking) { clearInterval(keepAlive); keepAlive = null; return; }
          if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        }, 5000);
        utterance.onend = function () {
          speaking = false;
          if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
          stopVAD();
          if (!resolved && !transcript) {
            if (silenceTimer) clearTimeout(silenceTimer);
            silenceTimer = setTimeout(function () {
              cleanup();
              resolve(transcript.trim() || '[no response]');
            }, 8000);
          }
        };
        utterance.onerror = function () {
          speaking = false;
          if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
          stopVAD();
        };
        window.speechSynthesis.speak(utterance);
        try { recognition.start(); } catch (e) {}
      }, 80);
    });
  }

  // ---------------------------------------------------------------------------
  // ANIMATIONS — GitHub-specific visual effects
  // ---------------------------------------------------------------------------

  var STYLE_ID = '__rt_styles';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.__rt_spot { position: relative; z-index: 10; background: rgba(59, 130, 246, 0.08) !important; ',
      '  outline: 2px solid rgba(59, 130, 246, 0.5); outline-offset: -1px; border-radius: 6px; ',
      '  transition: all 0.3s ease; }',
      '.__rt_blur { filter: blur(2px) opacity(0.4) !important; transition: filter 0.4s ease; }',
      '.__rt_line_spot { background: rgba(250, 204, 21, 0.18) !important; ',
      '  outline: 1px solid rgba(250, 204, 21, 0.4); }',
      '.__rt_banner { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); ',
      '  z-index: 99999; background: #1e293b; color: #f1f5f9; border-radius: 12px; ',
      '  padding: 16px 24px; max-width: 600px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); ',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; ',
      '  animation: __rt_slideUp 0.4s ease; }',
      '.__rt_banner h3 { margin: 0 0 6px 0; font-size: 15px; color: #60a5fa; }',
      '.__rt_banner p { margin: 0; font-size: 13px; line-height: 1.5; color: #cbd5e1; }',
      '@keyframes __rt_slideUp { from { opacity: 0; transform: translateX(-50%) translateY(20px); } ',
      '  to { opacity: 1; transform: translateX(-50%) translateY(0); } }',
      '.__rt_pulse { animation: __rt_pulseAnim 2s ease-in-out infinite; }',
      '@keyframes __rt_pulseAnim { 0%,100% { outline-color: rgba(59,130,246,0.5); } ',
      '  50% { outline-color: rgba(59,130,246,1); } }',
    ].join('\n');
    document.head.appendChild(style);
  }

  // Highlight a single file/folder row in the repo file list
  function spot(filename) {
    clear();
    injectStyles();
    var rows = document.querySelectorAll('div[role="row"].Box-row, tr.react-directory-row');
    var found = false;
    rows.forEach(function (row) {
      var link = row.querySelector('a');
      if (!link) return;
      var text = link.textContent.trim();
      if (text === filename || text.endsWith('/' + filename)) {
        row.classList.add('__rt_spot', '__rt_pulse');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        found = true;
      } else {
        row.classList.add('__rt_blur');
      }
    });
    // Also try the new React-based file explorer
    if (!found) {
      var allLinks = document.querySelectorAll('a.Link--primary');
      allLinks.forEach(function (link) {
        var text = link.textContent.trim();
        var row = link.closest('div[class*="Row"], tr, li');
        if (!row) return;
        if (text === filename) {
          row.classList.add('__rt_spot', '__rt_pulse');
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          found = true;
        } else if (row.querySelector('a')) {
          row.classList.add('__rt_blur');
        }
      });
    }
    return found;
  }

  // Highlight code lines in file view
  function spotLines(start, end) {
    clear();
    injectStyles();
    for (var i = start; i <= end; i++) {
      // GitHub uses id="LC1", "LC2", etc. for code lines
      var line = document.getElementById('LC' + i);
      if (line) {
        line.classList.add('__rt_line_spot');
        if (i === start) line.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Also try the React code view (data-line-number attribute)
      var reactLine = document.querySelector('[data-line-number="' + i + '"]');
      if (reactLine) {
        var codeLine = reactLine.closest('tr') || reactLine.parentElement;
        if (codeLine) codeLine.classList.add('__rt_line_spot');
        if (i === start) (codeLine || reactLine).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  // Show info banner at bottom of screen
  function banner(title, body) {
    var existing = document.getElementById('__rt_banner');
    if (existing) existing.remove();
    injectStyles();
    var div = document.createElement('div');
    div.id = '__rt_banner';
    div.className = '__rt_banner';
    div.innerHTML = '<h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(body) + '</p>';
    document.body.appendChild(div);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Clear all highlights and banners
  function clear() {
    document.querySelectorAll('.__rt_spot, .__rt_pulse').forEach(function (el) {
      el.classList.remove('__rt_spot', '__rt_pulse');
    });
    document.querySelectorAll('.__rt_blur').forEach(function (el) {
      el.classList.remove('__rt_blur');
    });
    document.querySelectorAll('.__rt_line_spot').forEach(function (el) {
      el.classList.remove('__rt_line_spot');
    });
    var b = document.getElementById('__rt_banner');
    if (b) b.remove();
  }

  // ---------------------------------------------------------------------------
  // PAGE INSPECTION — extract info from current GitHub page
  // ---------------------------------------------------------------------------

  // Get list of files/folders visible in the repo directory
  function getFiles() {
    var files = [];
    // Classic GitHub layout
    var rows = document.querySelectorAll('div[role="row"].Box-row, tr.react-directory-row');
    rows.forEach(function (row) {
      var link = row.querySelector('a');
      if (!link) return;
      var name = link.textContent.trim();
      var isDir = !!row.querySelector('svg[aria-label="Directory"]') ||
                  !!row.querySelector('[class*="directory"]') ||
                  link.getAttribute('href')?.includes('/tree/');
      files.push({ name: name, type: isDir ? 'dir' : 'file' });
    });
    // React file explorer fallback
    if (files.length === 0) {
      var links = document.querySelectorAll('a.Link--primary');
      links.forEach(function (link) {
        var row = link.closest('div[class*="Row"], tr, li');
        if (!row) return;
        var name = link.textContent.trim();
        if (!name) return;
        var href = link.getAttribute('href') || '';
        var isDir = href.includes('/tree/');
        files.push({ name: name, type: isDir ? 'dir' : 'file' });
      });
    }
    return files;
  }

  // Determine what kind of GitHub page we're on
  function getPageType() {
    var url = window.location.pathname;
    if (url.match(/\/blob\//)) return 'file';
    if (url.match(/\/tree\//) || url.match(/^\/[^/]+\/[^/]+\/?$/)) return 'directory';
    if (url.match(/\/pull\//)) return 'pull_request';
    if (url.match(/\/issues\//)) return 'issue';
    return 'other';
  }

  // Extract visible code content from a file view
  function getCodeText() {
    // Try the code table
    var codeTable = document.querySelector('table.highlight, table.js-file-line-container');
    if (codeTable) return codeTable.textContent;
    // Try React code view
    var codeLines = document.querySelectorAll('[data-line-number] + td, .react-code-text');
    if (codeLines.length > 0) {
      return Array.from(codeLines).map(function (el) { return el.textContent; }).join('\n');
    }
    // Try the blob wrapper
    var blob = document.querySelector('.blob-wrapper, .react-blob-print-hide');
    if (blob) return blob.textContent;
    // Try readme
    var readme = document.querySelector('#readme article, .markdown-body');
    if (readme) return readme.textContent;
    return '';
  }

  // Get README content specifically
  function getReadme() {
    var readme = document.querySelector('#readme article, .markdown-body');
    return readme ? readme.textContent : '';
  }

  // Get repo description from the About section
  function getRepoDescription() {
    var about = document.querySelector('.f4.my-3, .BorderGrid-cell p.f4');
    return about ? about.textContent.trim() : '';
  }

  // ---------------------------------------------------------------------------
  // Expose API on window.__rt
  // ---------------------------------------------------------------------------

  window.__rt = {
    // Voice
    speak: speak,
    listen: listen,
    speakAndListen: speakAndListen,
    requestMic: requestMic,
    killActiveAudio: killActiveAudio,

    // Animations
    spot: spot,
    spotLines: spotLines,
    banner: banner,
    clear: clear,

    // Page inspection
    getFiles: getFiles,
    getPageType: getPageType,
    getCodeText: getCodeText,
    getReadme: getReadme,
    getRepoDescription: getRepoDescription,

    // Version
    version: '1.0.0'
  };

  console.log('[RepoTour] Engine v1.0.0 loaded');
})();
