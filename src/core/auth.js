// Demo user directory. Role gating lives in app.js until views are
// extracted (Phase 0a-3), because it mutates shared UI cursors.

import { state } from './state.js';
import { toast } from './dom.js';
import { checkSession } from './roles.js';
import { render } from './router.js';

export const users = {
  'admin@repellent.com': { email: 'admin@repellent.com', name: 'Seda Kaya', role: 'admin', title: 'Operasyon Yöneticisi (Boss)', avatar: 'SK' },
  'admin@ladybug.com': { email: 'admin@repellent.com', name: 'Seda Kaya', role: 'admin', title: 'Operasyon Yöneticisi (Boss)', avatar: 'SK' },
  'admin@insectram.com': { email: 'admin@repellent.com', name: 'Seda Kaya', role: 'admin', title: 'Operasyon Yöneticisi (Boss)', avatar: 'SK' },
  'ayse@repellent.com': { email: 'ayse@repellent.com', name: 'Ayşe Demir', role: 'tech', title: 'Baş Teknisyen', avatar: 'AD' },
  'ayse@ladybug.com': { email: 'ayse@repellent.com', name: 'Ayşe Demir', role: 'tech', title: 'Baş Teknisyen', avatar: 'AD' },
  'ayse@insectram.com': { email: 'ayse@repellent.com', name: 'Ayşe Demir', role: 'tech', title: 'Baş Teknisyen', avatar: 'AD' },
  'acme@client.com': { email: 'acme@client.com', name: 'Ahmet Çelik', role: 'client', title: 'Acme Gıda Yetkilisi', avatar: 'AC' }
};

// Fast role switching for the demo (task 5-4): flip the presenter between
// admin / technician / client with no re-login. Reuses the same session
// machinery as a real login so role access is applied identically.
const ROLE_ACCOUNTS = { admin: 'admin@repellent.com', tech: 'ayse@repellent.com', client: 'acme@client.com' };

export function switchRole(role) {
  const user = users[ROLE_ACCOUNTS[role]];
  if (!user) return;
  if (state.currentUser && state.currentUser.role === role) return; // already there
  state.currentUser = user;
  localStorage.setItem('repellent-user', JSON.stringify(user));
  checkSession();   // re-applies role access + rebuilds the sidebar footer
  render();         // repaint every view for the new role's data scope
  toast(`Rol değiştirildi → ${user.name} · ${user.title}`);
}
