// In-memory User Database representing coastal regions
export const users = [
  {
    id: "user_1",
    name: "Rajesh Mohanty",
    phone: "+919876543210",
    language: "Hindi",
    location: "Puri Coastal Zone, Odisha",
    lat: 19.8134,
    lng: 85.8312,
    status: "Pending",
    channel: "WhatsApp",
    lastMessage: null,
    updatedAt: new Date().toISOString()
  },
  {
    id: "user_2",
    name: "Karthik Swaminathan",
    phone: "+917654321098",
    language: "Tamil",
    location: "Nagapattinam, Tamil Nadu",
    lat: 10.7672,
    lng: 79.8444,
    status: "Pending",
    channel: "WhatsApp",
    lastMessage: null,
    updatedAt: new Date().toISOString()
  },
  {
    id: "user_3",
    name: "Ananya Banerjee",
    phone: "+918765432109",
    language: "Bengali",
    location: "Digha, West Bengal",
    lat: 21.6266,
    lng: 87.5074,
    status: "Pending",
    channel: "WhatsApp",
    lastMessage: null,
    updatedAt: new Date().toISOString()
  },
  {
    id: "user_4",
    name: "Subhashree Dash",
    phone: "+916543210987",
    language: "Hindi",
    location: "Paradip Port, Odisha",
    lat: 20.2606,
    lng: 86.6666,
    status: "Pending",
    channel: "WhatsApp",
    lastMessage: null,
    updatedAt: new Date().toISOString()
  },
  {
    id: "user_5",
    name: "Debashis Sen",
    phone: "+919988776655",
    language: "Bengali",
    location: "Sundarbans Delta, West Bengal",
    lat: 21.9497,
    lng: 89.1833,
    status: "Pending",
    channel: "WhatsApp",
    lastMessage: null,
    updatedAt: new Date().toISOString()
  }
];

export function resetUsers() {
  users.forEach(user => {
    user.status = "Pending";
    user.channel = "WhatsApp";
    user.lastMessage = null;
    user.updatedAt = new Date().toISOString();
  });
}
