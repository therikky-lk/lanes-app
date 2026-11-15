import { useState, type ReactNode } from "react";

export function ServiceAccountAvatar({ url, children, className }: {
  url?: string | null;
  children: ReactNode;
  className: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();

  return (
    <div className={`flex size-[64px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] ${className}`}>
      {url && url !== failedUrl ? (
        <img src={url} alt="" className="size-full object-cover" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
      ) : children}
    </div>
  );
}
