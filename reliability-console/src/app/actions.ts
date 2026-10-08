'use server'

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-client';

export async function replayDlqEventAction(id: string) {
  try {
    await api.user.replayDlqEvent(id);
    revalidatePath('/'); // Refresh dashboard
    revalidatePath('/dlq'); // Refresh DLQ page
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to replay event' };
  }
}

export async function setFaultAction(service: 'user' | 'order', config: any) {
  try {
    if (service === 'user') {
      await api.user.setFault(config);
    } else {
      await api.order.setFault(config);
    }
    revalidatePath('/');
    revalidatePath('/faults');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to set fault' };
  }
}

export async function disableAllFaultsAction(service: 'user' | 'order') {
  try {
    if (service === 'user') {
      await api.user.disableAllFaults();
    } else {
      await api.order.disableAllFaults();
    }
    revalidatePath('/');
    revalidatePath('/faults');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to disable faults' };
  }
}
