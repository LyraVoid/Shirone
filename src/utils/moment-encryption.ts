export type MomentEncryptionData = {
	encrypted?: boolean;
	password?: string | number;
};

/**
 * 解析动态的加密状态；显式声明加密却没有有效密码时拒绝明文发布。
 */
export function isEncryptedMoment(
	data: MomentEncryptionData,
): data is MomentEncryptionData & { password: string | number } {
	const hasPassword =
		data.password !== undefined && String(data.password).trim().length > 0;
	if (data.encrypted && !hasPassword) {
		throw new Error("Encrypted moments require a non-empty password");
	}
	return hasPassword;
}
