export interface EnvironmentInfo {
  browserName: string;
  browserVersion: string;
  osName: string;
  osVersion: string;
  viewportMode: string;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  userAgent: string;
}

export function getEnvironment(viewportMode: string): EnvironmentInfo {
  const ua = navigator.userAgent;

  let browserName = 'Unknown';
  let browserVersion = '';
  if (/Edg\//.test(ua)) {
    browserName = 'Edge';
    browserVersion = (ua.match(/Edg\/([\d.]+)/) || [])[1] || '';
  } else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) {
    browserName = 'Chrome';
    browserVersion = (ua.match(/Chrome\/([\d.]+)/) || [])[1] || '';
  } else if (/Firefox\//.test(ua)) {
    browserName = 'Firefox';
    browserVersion = (ua.match(/Firefox\/([\d.]+)/) || [])[1] || '';
  } else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) {
    browserName = 'Safari';
    browserVersion = (ua.match(/Version\/([\d.]+)/) || [])[1] || '';
  }

  let osName = 'Unknown';
  let osVersion = '';
  if (/Windows NT ([\d.]+)/.test(ua)) {
    osName = 'Windows';
    osVersion = (ua.match(/Windows NT ([\d.]+)/) || [])[1] || '';
  } else if (/Mac OS X ([\d_]+)/.test(ua)) {
    osName = 'macOS';
    osVersion = ((ua.match(/Mac OS X ([\d_]+)/) || [])[1] || '').replace(/_/g, '.');
  } else if (/Linux/.test(ua)) {
    osName = 'Linux';
  } else if (/Android ([\d.]+)/.test(ua)) {
    osName = 'Android';
    osVersion = (ua.match(/Android ([\d.]+)/) || [])[1] || '';
  } else if (/iPhone OS ([\d_]+)/.test(ua)) {
    osName = 'iOS';
    osVersion = ((ua.match(/iPhone OS ([\d_]+)/) || [])[1] || '').replace(/_/g, '.');
  }

  return {
    browserName,
    browserVersion,
    osName,
    osVersion,
    viewportMode,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    userAgent: ua,
  };
}
