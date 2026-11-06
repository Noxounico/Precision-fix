export const shopRoles = ['1567315868344524833'];
export const isShopTicket = channel => /^precision-shop(?:-closed)?:/.test(channel?.topic || '');
