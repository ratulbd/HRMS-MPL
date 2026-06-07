const mongoose = require('mongoose');

const SubCenterSettingSchema = new mongoose.Schema({
    subCenterName: { type: String, required: true, unique: true },
    leaveHierarchy: [{ type: String }],
    attendanceInHierarchy: [{ type: String }],
    attendanceOutHierarchy: [{ type: String }],
    isComplianceRelaxed: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('SubCenterSetting', SubCenterSettingSchema);
