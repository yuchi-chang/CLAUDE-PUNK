/**
 * Files tab — split layout with directory tree sidebar (left) and
 * FileEditor pane (right) for viewing/editing files.
 */

import wsService from '../services/websocket.js';
import FileEditor from './FileEditor.js';

export default class FilesTab {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.el = null;
    this.treeEl = null;
    this.fileCount = 0;
    this.drinkCount = 0;
    this.unsubFiles = null;
    this.unsubTree = null;
    this.unsubCreated = null;
    this.unsubDeleted = null;
    this.fileEditor = null;
    this.selectedNode = null;
    this.treeData = null;
  }

  render(container) {
    this.el = document.createElement('div');
    this.el.className = 'files-tab';

    // Left sidebar
    const sidebar = document.createElement('div');
    sidebar.className = 'files-sidebar';
    sidebar.innerHTML = `
      <div class="files-header">
        <span class="files-count">${this.fileCount} files \u2192 ${this.drinkCount} drinks</span>
        <div class="files-header-actions">
          <button class="files-new-file" title="New File">+</button>
          <button class="files-new-dir" title="New Folder">+\u25a1</button>
          <button class="files-refresh" title="Refresh">\u21bb</button>
        </div>
      </div>
      <div class="files-tree"></div>
    `;
    this.el.appendChild(sidebar);

    // Right editor pane
    this.fileEditor = new FileEditor(this.sessionId);
    this.fileEditor.render(this.el);

    container.appendChild(this.el);
    this.treeEl = sidebar.querySelector('.files-tree');

    sidebar.querySelector('.files-refresh').addEventListener('click', () => {
      this.requestTree();
    });

    sidebar.querySelector('.files-new-file').addEventListener('click', () => {
      this.showCreateInput(false);
    });

    sidebar.querySelector('.files-new-dir').addEventListener('click', () => {
      this.showCreateInput(true);
    });

    // Listen for tree response
    this.unsubTree = wsService.on('files.tree', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      this.treeData = payload.tree;
      this.renderTree(payload.tree);
    });

    // Listen for file count updates and auto-refresh tree
    this.unsubFiles = wsService.on('files.update', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      this.fileCount = payload.fileCount;
      this.drinkCount = payload.drinkCount;
      const countEl = sidebar.querySelector('.files-count');
      if (countEl) {
        countEl.textContent = `${this.fileCount} files \u2192 ${this.drinkCount} drinks`;
      }
      // Auto-refresh tree when files change (debounced by backend already)
      wsService.requestFileTree(this.sessionId);
    });

    // Listen for create/delete confirmations and refresh tree
    this.unsubCreated = wsService.on('file.created', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      this.requestTree();
      // Open newly created file in editor
      if (!payload.isDir) {
        this.fileEditor.openFile(payload.filePath);
      }
    });

    this.unsubDeleted = wsService.on('file.deleted', (payload) => {
      if (payload.sessionId !== this.sessionId) return;
      // If the deleted file is currently open, clear editor
      if (this.fileEditor.currentFile === payload.filePath) {
        this.fileEditor.openFile(null);
      }
      this.requestTree();
    });

    // Request tree on render
    this.requestTree();
  }

  requestTree() {
    if (this.treeEl) {
      this.treeEl.innerHTML = '<div class="files-loading">Loading...</div>';
    }
    wsService.requestFileTree(this.sessionId);
  }

  renderTree(nodes) {
    if (!this.treeEl) return;
    this.treeEl.innerHTML = '';
    if (!nodes || nodes.length === 0) {
      this.treeEl.innerHTML = '<div class="files-empty">No files</div>';
      return;
    }
    const ul = this.buildTreeDOM(nodes);
    this.treeEl.appendChild(ul);
  }

  buildTreeDOM(nodes) {
    const ul = document.createElement('ul');
    ul.className = 'file-list';

    for (const node of nodes) {
      const li = document.createElement('li');
      li.className = node.isDir ? 'file-node dir' : 'file-node file';

      const row = document.createElement('div');
      row.className = 'file-row';

      const label = document.createElement('span');
      label.className = 'file-label';

      // Delete button (shown on hover via CSS)
      const delBtn = document.createElement('button');
      delBtn.className = 'file-delete-btn';
      delBtn.title = `Delete ${node.name}`;
      delBtn.textContent = '\u00d7';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.confirmDelete(node);
      });

      if (node.isDir) {
        label.textContent = `\u25b8 ${node.name}/`;
        label.addEventListener('click', () => {
          li.classList.toggle('expanded');
          label.textContent = li.classList.contains('expanded')
            ? `\u25be ${node.name}/`
            : `\u25b8 ${node.name}/`;
        });
      } else {
        const size = this.formatSize(node.size || 0);
        label.textContent = `  ${node.name}`;

        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'file-size';
        sizeSpan.textContent = size;
        label.appendChild(sizeSpan);

        // Click file to open in editor
        label.addEventListener('click', () => {
          // Deselect previous
          if (this.selectedNode) {
            this.selectedNode.classList.remove('selected');
          }
          li.classList.add('selected');
          this.selectedNode = li;
          this.fileEditor.openFile(node.path);
        });
      }

      row.appendChild(label);
      row.appendChild(delBtn);
      li.appendChild(row);

      if (node.isDir && node.children && node.children.length > 0) {
        const childUl = this.buildTreeDOM(node.children);
        li.appendChild(childUl);
      }

      ul.appendChild(li);
    }

    return ul;
  }

  /** Show inline input at top of tree for creating a new file or folder */
  showCreateInput(isDir) {
    // Remove any existing input
    const existing = this.treeEl?.querySelector('.file-create-input');
    if (existing) existing.remove();

    const row = document.createElement('div');
    row.className = 'file-create-input';

    const icon = document.createElement('span');
    icon.className = 'file-create-icon';
    icon.textContent = isDir ? '\u25a1 ' : '+ ';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = isDir ? 'folder/path' : 'path/to/file.ext';
    input.className = 'file-create-field';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'file-create-cancel';
    cancelBtn.textContent = '\u00d7';
    cancelBtn.addEventListener('click', () => row.remove());

    const submit = () => {
      const name = input.value.trim();
      if (!name) { row.remove(); return; }
      wsService.createFile(this.sessionId, name, isDir);
      row.remove();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') row.remove();
    });

    row.appendChild(icon);
    row.appendChild(input);
    row.appendChild(cancelBtn);

    if (this.treeEl) {
      this.treeEl.prepend(row);
      input.focus();
    }
  }

  /** Show delete confirmation overlay */
  confirmDelete(node) {
    // Remove any existing confirmation
    const existing = this.el?.querySelector('.file-confirm-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'file-confirm-overlay';

    const typeLabel = node.isDir ? 'folder' : 'file';
    overlay.innerHTML = `
      <div class="file-confirm-box">
        <div class="file-confirm-msg">Delete ${typeLabel} <strong>${node.name}</strong>${node.isDir ? ' and all contents' : ''}?</div>
        <div class="file-confirm-actions">
          <button class="file-confirm-yes">DELETE</button>
          <button class="file-confirm-no">CANCEL</button>
        </div>
      </div>
    `;

    overlay.querySelector('.file-confirm-yes').addEventListener('click', () => {
      wsService.deleteFile(this.sessionId, node.path);
      overlay.remove();
    });
    overlay.querySelector('.file-confirm-no').addEventListener('click', () => {
      overlay.remove();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    this.el.appendChild(overlay);
  }

  formatSize(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  }

  destroy() {
    if (this.unsubTree) this.unsubTree();
    if (this.unsubFiles) this.unsubFiles();
    if (this.unsubCreated) this.unsubCreated();
    if (this.unsubDeleted) this.unsubDeleted();
    if (this.fileEditor) this.fileEditor.destroy();
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
