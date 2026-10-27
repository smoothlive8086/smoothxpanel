/**
 * SMOOTH x HOST - Terminal Manager with ANSI Color Parsing
 */

class TerminalManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.autoScroll = true;
    this.maxLines = 1200;
  }

  // Convert ANSI color escape codes to styled HTML
  ansiToHtml(text) {
    if (!text) return '';

    // Sanitize basic HTML first
    let clean = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Standard ANSI regex
    const ansiMap = {
      '30': 'color: #64748b;', // Black/Gray
      '31': 'color: #ef4444; font-weight: 600;', // Red
      '32': 'color: #10b981; font-weight: 500;', // Green
      '33': 'color: #f59e0b; font-weight: 500;', // Yellow
      '34': 'color: #38bdf8;', // Blue
      '35': 'color: #a855f7;', // Magenta
      '36': 'color: #00e5ff;', // Cyan
      '37': 'color: #f1f5f9;', // White
      '90': 'color: #64748b;',
      '91': 'color: #f87171;',
      '92': 'color: #34d399;',
      '93': 'color: #fbbf24;',
      '94': 'color: #60a5fa;',
      '95': 'color: #c084fc;',
      '96': 'color: #22d3ee;',
      '97': 'color: #ffffff;',
      '1': 'font-weight: 700;',
      '0': ''
    };

    // Replace ANSI codes
    clean = clean.replace(/\x1b\[([0-9;]+)m/g, (match, codeStr) => {
      if (codeStr === '0') return '</span>';
      const codes = codeStr.split(';');
      const styles = codes.map(c => ansiMap[c] || '').join(' ');
      return `<span style="${styles}">`;
    });

    // Auto-highlight typical server logs
    clean = clean
      .replace(/(\[INFO\]|\[Server thread\/INFO\])/g, '<span style="color: #38bdf8; font-weight: 600;">$1</span>')
      .replace(/(\[WARN\]|\[WARNING\])/g, '<span style="color: #f59e0b; font-weight: 700;">$1</span>')
      .replace(/(\[ERROR\]|\[SEVERE\])/g, '<span style="color: #ef4444; font-weight: 700;">$1</span>')
      .replace(/(\[Wings Daemon\])/g, '<span style="color: #00e5ff; font-weight: 700;">$1</span>')
      .replace(/(\[SMOOTH x HOST\])/g, '<span style="color: #a855f7; font-weight: 700;">$1</span>');

    return clean;
  }

  appendLine(line) {
    if (!this.container) return;

    const lineEl = document.createElement('div');
    lineEl.className = 'log-line';
    lineEl.innerHTML = this.ansiToHtml(line);
    this.container.appendChild(lineEl);

    // Trim old lines
    while (this.container.children.length > this.maxLines) {
      this.container.removeChild(this.container.firstChild);
    }

    if (this.autoScroll) {
      this.scrollToBottom();
    }
  }

  clear() {
    if (this.container) {
      this.container.innerHTML = '';
      this.appendLine(`\x1b[36m[SMOOTH x HOST]\x1b[0m Console cleared by user.`);
    }
  }

  scrollToBottom() {
    if (this.container) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  }

  getPlainText() {
    if (!this.container) return '';
    return this.container.innerText;
  }

  downloadLogs(serverName = 'server') {
    const text = this.getPlainText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${serverName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_latest.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

window.TerminalManager = TerminalManager;
