export const shopRoles = ['1567314709164851362', '1563910348459737178', '1567833576760680548'];
export const isShopTicket = channel => /^precision-shop(?:-closed)?:/.test(channel?.topic || '');
