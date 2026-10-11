/**
 * Lo unico de `react-dom` que usa la app: `createPortal`, en Ocupado.web.tsx
 * (la capa del juego a pantalla completa va en <body>). react-dom esta instalado
 * (lo trae expo-router para la web) pero sin sus tipos, y no compensa una
 * dependencia mas por una funcion: se declara aqui, igual que src/types/css.d.ts.
 */
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react';

  export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null): ReactPortal;
}
