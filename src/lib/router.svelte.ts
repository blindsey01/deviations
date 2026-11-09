/**
 * Minimal hash router: the part of the URL after "#" is the page.
 * Hash URLs work on GitHub Pages without any server setup.
 */
export const route = $state({ path: location.hash.slice(1) || '/' });

window.addEventListener('hashchange', () => {
  route.path = location.hash.slice(1) || '/';
  window.scrollTo(0, 0);
});

export function go(path: string): void {
  location.hash = path;
}

export const tHref = (tournamentId: string, rest = '') => `#/t/${encodeURIComponent(tournamentId)}${rest}`;
