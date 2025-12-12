import { useState, useEffect } from 'react';

type Orientation = 'portrait' | 'landscape';

export const useOrientation = (): Orientation => {
  const getOrientation = (): Orientation => {
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  };

  const [orientation, setOrientation] = useState<Orientation>(getOrientation());

  useEffect(() => {
    const handleResize = () => {
      setOrientation(getOrientation());
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return orientation;
};
