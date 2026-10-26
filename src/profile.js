// Save the successfully applied URL per bot account to avoid repeating profile edits.
export async function applyBanner(user, url, state, persist) {
  if (!url) return false;
  const previous = state.botProfile;
  if (previous?.userId === user.id && previous.bannerUrl === url && previous.bannerHash === user.banner && user.banner) return false;
  const updated = await user.setBanner(url);
  state.botProfile = { userId: user.id, bannerUrl: url, bannerHash: updated.banner };
  await persist(state);
  return true;
}
