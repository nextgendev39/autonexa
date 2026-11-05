"use client";

import { useSyncExternalStore } from "react";

import { appConfig } from "@/config/app";

const subscribe = () => () => {};
const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || appConfig.timezone;
const dealershipTimeZone = () => appConfig.timezone;

/**
 * The viewer's device time zone, so times match their clock. The server render (and
 * hydration) uses the dealership's zone, then switches to the device's on the client.
 */
export function useViewerTimeZone() {
  return useSyncExternalStore(subscribe, deviceTimeZone, dealershipTimeZone);
}
