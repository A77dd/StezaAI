module.exports = {
    ROLES: {
        USER: 'user',
        ADMIN: 'admin',
        OWNER: 'owner'
    },
    
    ROLE_ABILITIES: {
        user: ['view_own_data'],
        admin: ['view_own_data', 'view_users', 'approve_users'],
        owner: ['view_own_data', 'view_users', 'approve_users', 'manage_admins']
    },
    
    DEFAULT_CODE: '1234'
};