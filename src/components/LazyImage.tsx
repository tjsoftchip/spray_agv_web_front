import React, { useState, useEffect, useRef } from 'react';
import { Skeleton } from 'antd';

interface LazyImageProps {
  src: string;
  alt?: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  width?: string | number;
  height?: string | number;
}

const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt = '',
  placeholder,
  className,
  style,
  width,
  height,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px',
      }
    );

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  return (
    <div
      ref={imgRef}
      style={{
        width: width || '100%',
        height: height || 'auto',
        position: 'relative',
        ...style,
      }}
      className={className}
    >
      {!isLoaded && (
        <Skeleton.Image
          active
          style={{
            width: width || '100%',
            height: height || 200,
          }}
        />
      )}
      {isInView && (
        <img
          src={src}
          alt={alt}
          onLoad={handleLoad}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: isLoaded ? 'block' : 'none',
          }}
        />
      )}
      {placeholder && !isInView && !isLoaded && (
        <img
          src={placeholder}
          alt={alt}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(10px)',
          }}
        />
      )}
    </div>
  );
};

export default LazyImage;
