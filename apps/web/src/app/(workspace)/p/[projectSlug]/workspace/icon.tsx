import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#2563eb',
          borderRadius: '6px',
        }}
      >
        {/* Monitor icon — matches the workspace icon in admin sidebar */}
        <svg
          viewBox="0 0 16 16"
          fill="white"
          width="22"
          height="22"
        >
          <path d="M6 12h4v1H6v-1zm-1 0v2h6v-2h2a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2zm-2-2V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
