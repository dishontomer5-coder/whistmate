import { createContext, useContext, useEffect } from 'react';

// Lets a page inside the Layout ask for the tab bar on a route where it is hidden by
// default. Round pages (/round/:id) hide it, because bidding and results draw their own
// action bar at the bottom of the screen; a round that is already scored is a page to
// read and move on from, so it can show the tabs again (returning-player-7):
//
//   useShowTabBar(round.status === 'complete' || round.status === 'cancelled');
//
// The request lasts while the page is mounted and `show` is true.
export const TabBarContext = createContext(() => {});

export function useShowTabBar(show) {
  const setShow = useContext(TabBarContext);
  useEffect(() => {
    if (!show) return undefined;
    setShow(true);
    return () => setShow(false);
  }, [show, setShow]);
}
